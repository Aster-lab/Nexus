"use client";

import { useEffect, useMemo, useState } from "react";

type GeoModule = typeof import("@geothai/core");
type GeoProvince = ReturnType<GeoModule["provinces"]>[number];
type GeoDistrict = ReturnType<GeoModule["districts"]>[number];
type GeoSubdistrict = ReturnType<GeoModule["subdistricts"]>[number];

export interface ThaiAddressSelection {
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
}

export function ThaiAddressFields({ value, onChange, required = false, idPrefix = "thai-address" }: {
  value: ThaiAddressSelection;
  onChange: (value: ThaiAddressSelection) => void;
  required?: boolean;
  idPrefix?: string;
}) {
  const [geo, setGeo] = useState<GeoModule | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    import("@geothai/core").then((module) => { if (active) setGeo(module); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);

  const provinces = useMemo(() => geo?.provinces() ?? [], [geo]);
  const selectedProvince = provinces.find((item: GeoProvince) => item.name_en === value.province);
  const districts = useMemo(() => selectedProvince && geo ? geo.districts(selectedProvince.code) : [], [geo, selectedProvince]);
  const selectedDistrict = districts.find((item: GeoDistrict) => item.name_en === value.district);
  const subdistricts = useMemo(() => selectedDistrict && geo ? geo.subdistricts(selectedDistrict.code) : [], [geo, selectedDistrict]);
  const selectedSubdistrict = subdistricts.find((item: GeoSubdistrict) => item.name_en === value.subdistrict);
  const postalCodes = selectedSubdistrict?.postal_codes ?? [];

  function label(en: string, th: string) { return `${en} — ${th}`; }
  const selectClass = "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
  const fieldLabel = (name: string) => <span>{name}{required ? <span className="ml-1 text-destructive" aria-hidden="true">*</span> : null}</span>;

  if (loadError) return <p className="text-sm text-destructive" role="alert">Thai address data could not be loaded. Refresh the page and try again.</p>;

  return <div className="grid min-w-0 gap-4 sm:grid-cols-2">
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">{fieldLabel("Province")}<select id={`${idPrefix}-province`} className={selectClass} required={required} value={value.province} onChange={(event) => onChange({ province: event.target.value, district: "", subdistrict: "", postalCode: "" })}><option value="">Select province</option>{provinces.map((item: GeoProvince) => <option key={item.code} value={item.name_en}>{label(item.name_en, item.name_th)}</option>)}</select></label>
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">{fieldLabel("District")}<select id={`${idPrefix}-district`} className={selectClass} required={required} disabled={!selectedProvince} value={value.district} onChange={(event) => onChange({ ...value, district: event.target.value, subdistrict: "", postalCode: "" })}><option value="">Select district</option>{districts.map((item: GeoDistrict) => <option key={item.code} value={item.name_en}>{label(item.name_en, item.name_th)}</option>)}</select></label>
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">{fieldLabel("Subdistrict")}<select id={`${idPrefix}-subdistrict`} className={selectClass} required={required} disabled={!selectedDistrict} value={value.subdistrict} onChange={(event) => { const item = subdistricts.find((entry: GeoSubdistrict) => entry.name_en === event.target.value); onChange({ ...value, subdistrict: event.target.value, postalCode: item?.postal_codes.length === 1 ? item.postal_codes[0] : "" }); }}><option value="">Select subdistrict</option>{subdistricts.map((item: GeoSubdistrict) => <option key={item.code} value={item.name_en}>{label(item.name_en, item.name_th)}</option>)}</select></label>
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">{fieldLabel("Postal code")}<select id={`${idPrefix}-postal-code`} className={selectClass} required={required} disabled={!selectedSubdistrict} value={value.postalCode} onChange={(event) => onChange({ ...value, postalCode: event.target.value })}><option value="">Select postal code</option>{postalCodes.map((postalCode: string) => <option key={postalCode} value={postalCode}>{postalCode}</option>)}</select></label>
  </div>;
}
