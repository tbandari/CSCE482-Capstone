import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';

/** Reads a document-picker result as text on iOS and Android. */
export async function readPickedFileText(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).text();
}
