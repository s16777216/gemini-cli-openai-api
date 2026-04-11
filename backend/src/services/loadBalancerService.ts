import { UpstreamRepository } from "../repositories/upstreamRepository";
import { GeminiApiProvider } from "./providers/geminiApiProvider";
import type { UpstreamCredential, OAuth2Config } from "../schemas/upstream";
import { logger } from "../utils/logger";

export class LoadBalancerService {
    private static instance: LoadBalancerService;
    private upstreamRepo: UpstreamRepository;

    private constructor() {
        this.upstreamRepo = UpstreamRepository.getInstance();
    }

    public static getInstance(): LoadBalancerService {
        if (!LoadBalancerService.instance) {
            LoadBalancerService.instance = new LoadBalancerService();
        }
        return LoadBalancerService.instance;
    }

    /**
     * Get an available Gemini provider using a random selection strategy.
     */
    public async getProvider(): Promise<{ provider: GeminiApiProvider; credentialId: string } | null> {
        const activeCreds = this.upstreamRepo.findActive();

        if (activeCreds.length === 0) {
            logger.warn("No active upstream credentials found");
            return null;
        }

        // 策略更新：選擇最久未使用的憑證 (Least Recently Used / Round Robin)
        // 因為 findActive() 已按 lastUsedAt ASC 排序，第 0 個就是最久沒被用到的
        const selected = activeCreds[0];

        if (!selected) return null;

        try {
            let provider: GeminiApiProvider;
            
            if (selected.type === 'api_key') {
                provider = new GeminiApiProvider(selected.config, 'api_key', selected.label);
            } else {
                const config = JSON.parse(selected.config) as OAuth2Config;
                provider = new GeminiApiProvider(config, 'oauth2', selected.label);
            }
            
            // Update last used time asynchronously
            this.upstreamRepo.updateLastUsed(selected.id);
            
            return { provider, credentialId: selected.id, label: selected.label };
        } catch (e) {
            logger.error("Failed to initialize provider from config", { id: selected.id, error: String(e) });
            // If config is broken, mark as invalid?
            this.upstreamRepo.updateStatus(selected.id, 'invalid');
            return this.getProvider(); // Recursive call to try another one
        }
    }

    /**
     * Mark a credential as rate limited.
     */
    public markRateLimited(id: string, retryAfterSeconds: number = 60): void {
        const recoveryAt = Date.now() + (retryAfterSeconds * 1000);
        logger.warn("Marking upstream credential as rate limited", { id, retryAfterSeconds, recoveryAt });
        this.upstreamRepo.updateStatus(id, 'rate_limited', recoveryAt);
        
        // Auto-recovery after specified seconds
        setTimeout(() => {
            logger.info("Auto-recovering upstream credential from rate limit", { id });
            this.upstreamRepo.updateStatus(id, 'active', null);
        }, retryAfterSeconds * 1000);
    }
}
