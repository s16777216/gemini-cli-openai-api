import os from "os";
import path from "path";
import { config } from "../config";

export class GeminiArgument {
    prompt: string;
    model: string;

    constructor(prompt: string, model = config.defaultModel) {
        this.prompt = prompt;
        this.model = model;
    }

    toArgs(): string[] {
        return ["--model", this.model, "--output-format", "stream-json"];
    }
}
