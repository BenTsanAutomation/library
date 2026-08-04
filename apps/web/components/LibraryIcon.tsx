import LibraryFull from "@/public/icons/logo-full.svg";

export default function LibraryLogo({ height }: { height: number }) {
  return (
    <span className="flex items-center">
      <LibraryFull height={height} className={`fill-foreground`} />
    </span>
  );
}
