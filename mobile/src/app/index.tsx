import { useFocusEffect, useRouter } from 'expo-router';

/**
 * "/" opens the catalog, like the web's "See open settlements".
 *
 * The root layout anchors deep links on (tabs), so (tabs) already sits under
 * this route. dismissTo returns to it; a <Redirect> (a replace) would stack a
 * second copy of the tabs above the first.
 */
export default function Index() {
  const router = useRouter();
  useFocusEffect(() => {
    router.dismissTo('/lawsuits');
  });
  return null;
}
