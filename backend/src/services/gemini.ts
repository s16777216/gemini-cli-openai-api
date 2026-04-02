import os from "os";
import path from "path";
import { config } from "../config";

export class GeminiArgument {
    prompt: string;
    model: string;
    tempFilePath: string | null;

    constructor(prompt: string, model = config.defaultModel) {
        this.prompt = prompt;
        this.model = model;
        this.tempFilePath = null;
    }

    async toCommand(): Promise<string[]> {
        const tempFilePath = await this.writeTempFile(this.prompt);
        const args = ["--model", this.model, "--output-format", "stream-json"];
        const isWindows = os.platform() === "win32";

        if (isWindows) {
            return ["pwsh", "-Command", `cat "${tempFilePath}" | gemini ${args.join(" ")}`];
        } else {
            return ["sh", "-c", `cat "${tempFilePath}" | gemini ${args.join(" ")}`];
        }
    }

    private async writeTempFile(prompt: string): Promise<string> {
        const start = performance.now();
        const tempFilePath = `${config.tempFolder}/${Date.now()}`;
        await Bun.write(tempFilePath, prompt);
        const duration = (performance.now() - start).toFixed(2);
        console.log(`[Perf] Temp file written: ${duration}ms`);
        this.tempFilePath = tempFilePath;
        return tempFilePath;
    }

    async cleanTempFile(): Promise<void> {
        if (this.tempFilePath) {
            await Bun.file(this.tempFilePath).delete();
            this.tempFilePath = null;
        }
    }
}
