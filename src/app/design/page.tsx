import { notFound } from "next/navigation";
import { DesignGallery } from "@/components/design-gallery";

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DesignGallery />;
}
