import type { ProductAttribute } from "./product-details.ts";
type Option = { id: number; name: string; option: string };
const same = (a: Option, b: { id: number; name: string }) => a.id > 0 ? a.id === b.id : b.id === 0 && a.name.toLowerCase() === b.name.toLowerCase();
export function validVariationOptions(attributes: ProductAttribute[], options: Option[]) {
  const required = attributes.filter(a => a.variation);
  return required.length > 0 && options.length === required.length && required.every(a => {
    const matches = options.filter(o => same(o, a));
    return matches.length === 1 && a.options.includes(matches[0].option);
  });
}
/** Existing "Any" options overlap concrete combinations too. */
export function overlapsVariation(options: Option[], existing: Option[]) {
  return options.every(option => {
    const match = existing.find(o => same(o, option));
    return match && (match.option === "" || match.option === option.option);
  });
}
