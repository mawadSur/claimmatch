import { useNavigation, useRouter } from 'expo-router';

import { IconButton } from '@/components/ui';
import { X } from '@/components/ui/icons';
import { common } from '@/copy/common';

/**
 * Header "Close" for modal screens. Closes the whole modal, even from a
 * screen pushed inside it (the (auth) group is its own stack). The fallback
 * returns to the anchored tabs instead of stacking a second copy of them.
 */
export function ModalCloseButton() {
  const navigation = useNavigation();
  const router = useRouter();

  function close() {
    const parent = navigation.getParent();
    if (parent?.canGoBack()) parent.goBack();
    else if (router.canGoBack()) router.back();
    else router.dismissTo('/lawsuits');
  }

  return <IconButton icon={X} accessibilityLabel={common.close.text} color="text" onPress={close} />;
}
