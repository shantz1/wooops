"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";

type Density = "comfortable" | "compact";

interface DensityToggleProps {
  density: Density;
  onChange: (density: Density) => void;
}

export function DensityToggle({ density, onChange }: DensityToggleProps) {
  return (
    <SegmentedControl
      label="Row density"
      value={density}
      onChange={onChange}
      options={[
        { value: "comfortable", label: "Comfortable" },
        { value: "compact", label: "Compact" },
      ]}
    />
  );
}
