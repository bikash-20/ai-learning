'use client';

import { Modal } from './Modal';
import { AvatarMenuBody } from './AvatarMenu';

/**
 * Avatar menu shown by the avatar button in the mobile top bar.
 *
 * Opens inside a `<Modal>` styled as a bottom sheet. The native
 * `<dialog>` handles focus trap + Escape for free. The body of the
 * menu (name/email + Theme + Logout) is rendered by
 * `<AvatarMenuBody>` so the two avatar menus stay in lockstep.
 */
export type MobileAvatarMenuProps = {
  open: boolean;
  onClose: () => void;
};

export const MobileAvatarMenu = ({ open, onClose }: MobileAvatarMenuProps) => (
  <Modal open={open} onClose={onClose} title="Account" variant="default">
    <AvatarMenuBody onAfterAction={onClose} />
  </Modal>
);