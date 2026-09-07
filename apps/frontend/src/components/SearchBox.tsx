import { useEffect, useState } from "react";

interface SearchBoxProps {
  onSearch: (value: string) => void;
  debounceMs?: number;
}

export function SearchBox({ onSearch, debounceMs = 300 }: SearchBoxProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => onSearch(value), debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSearch identity isn't a real dep here
  }, [value, debounceMs]);

  return (
    <input
      type="search"
      placeholder="Search name, email, or body..."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      aria-label="Search records"
    />
  );
}
