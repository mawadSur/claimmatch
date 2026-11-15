import type { DocumentMime, DocumentView, PacketItemView } from '@shared/lib/filing/v2/contract';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, FieldError } from '@/components/ui';
import { Camera, FileUp, Image as ImageIcon, RefreshCw, Trash } from '@/components/ui/icons';
import { docsCountText, docsFileText, docsUploadingText, filing as copy } from '@/copy/filing';
import { openExternalUrl } from '@/lib/external-link';
import { space } from '@/theme/tokens';

import { LOCKED_COPY } from './copy-maps';
import {
  completeDocument,
  createDocumentSlot,
  deleteDocument,
  documentDownload,
  readPickedFile,
  uploadToSignedUrl,
} from './api';
import { fileProblem, formatBytes, guessMime } from './form';
import { FieldIssues, Muted, filingStyles } from './parts';

/** One file on its way: the slot is kept so "Try again" re-sends to it while it is valid. */
interface Upload {
  key: number;
  file: Blob;
  mime: DocumentMime;
  phase: 'uploading' | 'checking' | 'failed';
  percent: number;
  slot: { id: string; url: string; expiresAt: string } | null;
  error: string | null;
}

/** What a picker returned, before it is read. */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size: number | null;
}

const STATUS_TEXT: Record<DocumentView['status'], string> = {
  stored: copy.docsStored.text,
  pending_upload: copy.docsPending.text,
  rejected: copy.docsRejected.text,
  deleted: copy.docsRejected.text,
};

/** A signed upload URL with under a minute left is replaced before sending. */
function slotExpiring(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now() + 60_000;
}

type Source = 'camera' | 'photos' | 'files';

/** Opens the camera, the photo library or the file picker; null when the member cancels. */
async function pickFrom(source: Source, accepted: readonly DocumentMime[]): Promise<PickedFile | 'denied' | null> {
  if (source === 'files') {
    const result = await DocumentPicker.getDocumentAsync({ type: [...accepted], copyToCacheDirectory: true, multiple: false });
    const asset = result.canceled ? null : result.assets[0];
    return asset ? { uri: asset.uri, name: asset.name, type: asset.mimeType ?? '', size: asset.size ?? null } : null;
  }
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'denied';
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset
    ? { uri: asset.uri, name: asset.fileName ?? asset.uri, type: asset.mimeType ?? '', size: asset.fileSize ?? null }
    : null;
}

/**
 * Proof uploads for one packet item (the web's DocumentUploader): take a
 * photo, choose one from the library or choose a file, with progress, retry
 * and remove. Bytes go straight to Storage through the signed upload URL
 * from POST .../documents; the server then checks the real type and size and
 * hashes the file (POST .../complete). File names are never sent.
 */
export function DocumentUploader({
  item,
  claimId,
  disabled,
  error,
  onChanged,
}: {
  item: PacketItemView;
  claimId: string;
  disabled: boolean;
  error: string | null;
  /** After a file is stored or removed, so the view (and Jev's hints) refresh. */
  onChanged: (message: string) => Promise<void>;
}) {
  const proof = item.proof;
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const nextKey = useRef(1);
  if (!proof) return null;
  const accepted = proof.accepted_mime;
  const documents = proof.documents.filter((d) => d.status !== 'deleted');
  const storedCount = documents.filter((d) => d.status === 'stored').length;
  const full = storedCount + uploads.filter((u) => u.phase !== 'failed').length >= proof.max_files;
  const locked = item.locked !== null;
  const off = disabled || locked;
  const photos = accepted.some((mime) => mime.startsWith('image/'));
  const testID = `filing-docs-${item.path}`;

  const patch = (key: number, next: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...next } : u)));

  async function send(upload: Upload) {
    let slot = upload.slot;
    if (!slot || slotExpiring(slot.expiresAt)) {
      const created = await createDocumentSlot(claimId, {
        kind: item.path.slice('documents.'.length),
        mime: upload.mime,
        size_bytes: upload.file.size,
      });
      if (!created.ok) return patch(upload.key, { phase: 'failed', error: created.error });
      slot = { id: created.data.document.id, url: created.data.upload.signed_url, expiresAt: created.data.upload.expires_at };
      patch(upload.key, { slot });
    }
    patch(upload.key, { phase: 'uploading', percent: 0, error: null });
    const put = await uploadToSignedUrl(slot.url, upload.file, upload.mime, (percent) => patch(upload.key, { percent }));
    if (!put.ok) return patch(upload.key, { phase: 'failed', error: copy.docsFailed.text });
    patch(upload.key, { phase: 'checking', percent: 100 });
    const done = await completeDocument(claimId, slot.id);
    if (!done.ok) {
      // A file the server refused is deleted there; a new attempt needs a new slot.
      const refused = done.code === 'document_invalid';
      return patch(upload.key, { phase: 'failed', error: done.error, slot: refused ? null : slot });
    }
    setUploads((list) => list.filter((u) => u.key !== upload.key));
    await onChanged(copy.docsStored.text);
  }

  async function pick(source: Source) {
    setProblem(null);
    if (full) return setProblem(copy.docsFull.text);
    let picked: PickedFile | 'denied' | null;
    try {
      picked = await pickFrom(source, accepted);
    } catch {
      return setProblem(copy.docsFailed.text);
    }
    if (picked === 'denied') return setProblem(copy.docsCameraDenied.text);
    if (!picked) return;
    const mime = guessMime(picked);
    const early = picked.size === null ? (mime && accepted.includes(mime) ? null : copy.docsWrongType.text) : fileProblem({ ...picked, size: picked.size }, accepted);
    if (early || !mime) return setProblem(early ?? copy.docsWrongType.text);
    const file = await readPickedFile(picked.uri);
    if (!file) return setProblem(copy.docsFailed.text);
    const sized = fileProblem({ name: picked.name, type: mime, size: file.size }, accepted);
    if (sized) return setProblem(sized);
    const upload: Upload = { key: nextKey.current++, file, mime, phase: 'uploading', percent: 0, slot: null, error: null };
    setUploads((list) => [...list, upload]);
    void send(upload);
  }

  async function discard(upload: Upload) {
    setUploads((list) => list.filter((u) => u.key !== upload.key));
    if (upload.slot) await deleteDocument(claimId, upload.slot.id);
  }

  async function remove(document: DocumentView) {
    setRemoving(document.id);
    const result = await deleteDocument(claimId, document.id);
    setRemoving(null);
    if (!result.ok) return setProblem(result.error);
    await onChanged('');
  }

  async function open(document: DocumentView) {
    const result = await documentDownload(claimId, document.id);
    if (!result.ok) return setProblem(result.error);
    await openExternalUrl(result.data.url);
  }

  return (
    <View style={filingStyles.tight} testID={testID}>
      <AppText variant="label" accessibilityRole="header">
        {`${item.label} (${item.required ? copy.required.text : copy.optional.text})`}
      </AppText>
      {item.help ? <Muted>{item.help}</Muted> : null}
      <Muted testID={`${testID}-count`}>{`${copy.docsTypes.text} ${docsCountText(storedCount, proof.max_files)}`}</Muted>
      {item.locked ? <Muted>{LOCKED_COPY[item.locked]}</Muted> : null}

      {documents.map((document, i) => {
        const name = docsFileText(i + 1, formatBytes(document.size_bytes));
        return (
          <View key={document.id} style={styles.row} testID={`${testID}-file-${i + 1}`}>
            <AppText variant="caption" style={styles.grow}>{`${name} · ${STATUS_TEXT[document.status]}`}</AppText>
            {document.status === 'stored' ? (
              <Button variant="ghost" label={copy.docsView.text} onPress={() => void open(document)} />
            ) : null}
            {!locked ? (
              <Button
                variant="ghost"
                icon={Trash}
                label={copy.docsRemove.text}
                accessibilityLabel={`${copy.docsRemove.text}: ${name}`}
                disabled={off || removing === document.id}
                onPress={() => void remove(document)}
                testID={`${testID}-remove-${i + 1}`}
              />
            ) : null}
          </View>
        );
      })}

      {uploads.map((upload) =>
        upload.phase === 'failed' ? (
          <View key={upload.key} style={filingStyles.tight} testID={`${testID}-failed`}>
            <AppText variant="caption" color="danger">
              {upload.error ?? copy.docsFailed.text}
            </AppText>
            <View style={filingStyles.row}>
              <Button variant="secondary" icon={RefreshCw} label={copy.docsRetry.text} disabled={off} onPress={() => void send(upload)} />
              <Button variant="ghost" label={copy.docsRemove.text} onPress={() => void discard(upload)} />
            </View>
          </View>
        ) : (
          <AppText key={upload.key} variant="caption" accessibilityLiveRegion="polite" testID={`${testID}-progress`}>
            {upload.phase === 'checking' ? copy.docsChecking.text : docsUploadingText(upload.percent)}
          </AppText>
        ),
      )}

      {!locked && !full ? (
        <View style={filingStyles.row}>
          {photos ? (
            <>
              <Button variant="secondary" icon={Camera} label={copy.docsTakePhoto.text} disabled={off} onPress={() => void pick('camera')} testID={`${testID}-camera`} />
              <Button variant="secondary" icon={ImageIcon} label={copy.docsChoosePhoto.text} disabled={off} onPress={() => void pick('photos')} testID={`${testID}-photos`} />
            </>
          ) : null}
          <Button variant="secondary" icon={FileUp} label={copy.docsChooseFile.text} disabled={off} onPress={() => void pick('files')} testID={`${testID}-files`} />
        </View>
      ) : null}
      {full && !locked ? <Muted>{copy.docsFull.text}</Muted> : null}
      <FieldIssues issues={item.issues} />
      <FieldError message={problem ?? error} testID={`${testID}-error`} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  grow: { flexGrow: 1, flexShrink: 1 },
});
