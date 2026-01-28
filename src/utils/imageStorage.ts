import { open } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';

// Directory name for storing images
const IMAGES_DIR = 'images';

/**
 * Get the path to the images directory in app data
 */
async function getImagesDir(): Promise<string> {
    const appData = await appDataDir();
    return await join(appData, IMAGES_DIR);
}

/**
 * Ensure the images directory exists
 */
async function ensureImagesDir(): Promise<void> {
    const imagesDir = await getImagesDir();
    if (!(await exists(imagesDir))) {
        await mkdir(imagesDir, { recursive: true });
    }
}

/**
 * Generate a unique filename based on timestamp and random string
 */
function generateFilename(originalName: string): string {
    const ext = originalName.split('.').pop() || 'png';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `img_${timestamp}_${random}.${ext}`;
}

/**
 * Open file picker, copy selected image to app data directory, and return the asset URL
 * @returns Asset URL that can be used in img src, or null if cancelled
 */
export async function pickAndSaveImage(): Promise<string | null> {
    try {
        // Open file picker
        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Images',
                extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
            }]
        });

        if (!selected) {
            return null; // User cancelled
        }

        const sourcePath = selected as string;

        // Ensure images directory exists
        await ensureImagesDir();

        // Generate unique filename
        const originalName = sourcePath.split('/').pop() || 'image.png';
        const newFilename = generateFilename(originalName);

        // Read source file
        const imageData = await readFile(sourcePath);

        // Write to images directory
        const imagesDir = await getImagesDir();
        const destPath = await join(imagesDir, newFilename);
        await writeFile(destPath, imageData);

        // Convert to asset URL for use in webview
        const assetUrl = convertFileSrc(destPath);

        return assetUrl;
    } catch (error) {
        console.error('Failed to pick and save image:', error);
        throw error;
    }
}

/**
 * Save an image from a File object (e.g., from drag-and-drop)
 * @param file The File object to save
 * @returns Asset URL that can be used in img src
 */
export async function saveImageFromFile(file: File): Promise<string> {
    try {
        // Ensure images directory exists
        await ensureImagesDir();

        // Generate unique filename
        const newFilename = generateFilename(file.name);

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Write to images directory
        const imagesDir = await getImagesDir();
        const destPath = await join(imagesDir, newFilename);
        await writeFile(destPath, uint8Array);

        // Convert to asset URL for use in webview
        const assetUrl = convertFileSrc(destPath);

        return assetUrl;
    } catch (error) {
        console.error('Failed to save image from file:', error);
        throw error;
    }
}

/**
 * Check if a URL is a local asset URL (from our stored images)
 */
export function isLocalAssetUrl(url: string): boolean {
    return url.startsWith('asset://') || url.startsWith('https://asset.localhost/');
}

/**
 * Get human-readable info about an image URL
 */
export function getImageUrlType(url: string): 'local' | 'remote' | 'data' | 'none' {
    if (!url) return 'none';
    if (url.startsWith('data:')) return 'data';
    if (isLocalAssetUrl(url)) return 'local';
    return 'remote';
}
