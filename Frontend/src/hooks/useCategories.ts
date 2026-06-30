import { useEffect, useState } from "react";
import apiClient from "../services/apiClient";

export interface CategoryOption {
  _id: string;
  name: string;
  color: string;
  description?: string;
  isActive: boolean;
  parentId?: string | null;
}

function lighten(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const mix = (c: number) => Math.round(c * 0.12 + 255 * 0.88);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export function useCategoryColor(cats: CategoryOption[], name: string) {
  const found = cats.find(c => c.name === name);
  return { color: found?.color ?? "#6B7280", bg: found ? lighten(found.color) : "#F3F4F6" };
}

export function useCategories() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    setLoading(true);
    apiClient.get("/categories")
      .then(res => setCategories(res.data.categories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { categories, loading, lighten };
}
