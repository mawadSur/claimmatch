import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { X } from '@/components/ui/icons';
import { catalog } from '@/copy/catalog';
import { layout, space } from '@/theme/tokens';

import { CatalogSearchField } from './CatalogSearchField';
import type { CatalogFilters as Filters } from './use-catalog-filters';

export interface CatalogFiltersProps {
  /** categoriesOf the whole open list, so the chips never depend on the search. */
  categories: string[];
  filters: Filters;
}

/**
 * The filter bar (src/components/LawsuitFilters.tsx): the search box, then
 * one row of chips that scrolls sideways (All, each category, "Has a
 * deadline", "No proof required"), and "Clear all filters" while any filter
 * is on. Chips are toggle buttons; the category chips act as one choice.
 */
export function CatalogFilters({ categories, filters }: CatalogFiltersProps) {
  return (
    <View style={styles.bar}>
      <CatalogSearchField
        value={filters.text}
        onChangeText={filters.setText}
        onSubmit={filters.submitSearch}
        onClear={filters.clearSearch}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipScroller}
        contentContainerStyle={styles.chips}
        testID="catalog-chips"
      >
        <Chip label={catalog.all.text} selected={!filters.category} onPress={filters.showAll} />
        {categories.map((category) => (
          <Chip
            key={category}
            label={category}
            selected={filters.category === category}
            onPress={() => filters.toggleCategory(category)}
          />
        ))}
        <Chip label={catalog.hasDeadline.text} selected={filters.hasDeadline} onPress={filters.toggleHasDeadline} />
        <Chip
          label={catalog.noProofRequired.text}
          selected={filters.proofNotRequired}
          onPress={filters.toggleProofNotRequired}
        />
      </ScrollView>
      {filters.active ? (
        <Button
          label={catalog.clearAllFilters.text}
          variant="ghost"
          icon={X}
          onPress={filters.clearAll}
          style={styles.clearAll}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: space[3],
  },
  chipScroller: {
    // Chips scroll edge to edge; the row's padding keeps the first and last in line with the content.
    marginHorizontal: -layout.screenPadding,
    flexGrow: 0,
  },
  chips: {
    gap: space[2],
    paddingHorizontal: layout.screenPadding,
  },
  clearAll: {
    alignSelf: 'flex-start',
    paddingHorizontal: space[2],
  },
});
