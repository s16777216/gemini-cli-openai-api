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

        // POC: Random selection
        const randomIndex = Math.floor(Math.random() * activeCreds.length);
        const selected = activeCreds[randomIndex];

        if (!selected) return null;

        try {
            const config = JSON.parse(selected.config) as OAuth2Config;
            const provider = new GeminiApiProvider(config);
            
            // Update last used time asynchronously
            this.upstreamRepo.updateLastUsed(selected.id);
            
            return { provider, credentialId: selected.id };
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
    public markRateLimited(id: string): void {
        logger.warn("Marking upstream credential as rate limited", { id });
        this.upstreamRepo.updateStatus(id, 'rate_limited');
        
        // Auto-recovery after 1 minute (simplistic POC logic)
        setTimeout(() => {
            logger.info("Auto-recovering upstream credential from rate limit", { id });
            this.upstreamRepo.updateStatus(id, 'active');
        }, 60000);
    }
}
