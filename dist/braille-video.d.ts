export interface BrailleFrameOptions {
    width: number;
    threshold: number;
    invert: boolean;
    maxChars: number;
}
export interface ExtractVideoFramesOptions {
    inputPath: string;
    outputDir: string;
    fps: number;
    maxFrames: number;
}
export declare function extractVideoFrames(options: ExtractVideoFramesOptions): Promise<string[]>;
export declare function frameToBraille(input: Buffer | string, options: BrailleFrameOptions): Promise<string>;
export declare function cleanupDir(dir: string): Promise<void>;
