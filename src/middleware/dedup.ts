/**
 * Message deduplication middleware
 * Prevents processing duplicate messages by tracking message IDs
 */

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebaseConfig.js';

/**
 * Check if a message should be skipped based on deduplication
 * @param phone - User phone number
 * @param messageId - WhatsApp message ID
 * @returns true if message should be skipped (duplicate), false otherwise
 */
export async function shouldSkipByMessageId(
  phone: string,
  messageId: string
): Promise<boolean> {
  if (!phone || !messageId) {
    return false;
  }

  const stateRef = db.collection('liveChatStates').doc(phone);
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() : {};

  // Check if this is a duplicate message
  if (state?.ultimoMessageId === messageId) {
    // Log the dedup skip
    await db.collection('logs').doc('dedupSkipped').collection('entries').add({
      phone,
      messageId,
      at: FieldValue.serverTimestamp(),
    });

    return true;
  }

  // Store the new message ID
  await stateRef.set(
    {
      ultimoMessageId: messageId,
    },
    { merge: true }
  );

  return false;
}
