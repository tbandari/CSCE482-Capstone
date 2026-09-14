import type { DocumentPickerAsset } from 'expo-document-picker';

/** Reads a document-picker result as text in the browser. */
export async function readPickedFileText(asset: DocumentPickerAsset): Promise<string> {
  if (asset.file) {
    return asset.file.text();
  }
  const response = await fetch(asset.uri);
  return response.text();
}
