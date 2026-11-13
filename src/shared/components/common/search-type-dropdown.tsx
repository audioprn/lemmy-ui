import { SearchType } from "lemmy-js-client";
import { FilterChipDropdown, FilterOption } from "./filter-chip-dropdown";
import {
  SHOW_COMMUNITIES,
  SHOW_MULTI_COMMUNITIES,
} from "../../audioprn/features";

const options: FilterOption<SearchType>[] = [
  { value: "all", i18n: "all" },
  { value: "comments", i18n: "comments" },
  { value: "posts", i18n: "posts" },
  { value: "communities", i18n: "communities" },
  { value: "users", i18n: "users" },
  { value: "multi_communities", i18n: "multi_communities" },
].filter(
  // audioprn: no search for hidden communities / multi-communities.
  o =>
    (SHOW_COMMUNITIES || o.value !== "communities") &&
    (SHOW_MULTI_COMMUNITIES || o.value !== "multi_communities"),
) as FilterOption<SearchType>[];

type SearchTypeDropdownProps = {
  currentOption: SearchType;
  onSelect: (val: SearchType) => void;
  className?: string;
};
export function SearchTypeDropdown({
  currentOption,
  onSelect,
  className,
}: SearchTypeDropdownProps) {
  return (
    <FilterChipDropdown
      allOptions={options}
      currentOption={options.find(t => t.value === currentOption)}
      onSelect={onSelect}
      className={className}
    />
  );
}
