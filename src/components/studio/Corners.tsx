/** Amber drafting brackets shown around selected elements. */
export default function Corners() {
  return (
    <>
      <span className="pointer-events-none absolute -left-1.5 -top-1.5 h-3 w-3 border-l-2 border-t-2 border-amber" />
      <span className="pointer-events-none absolute -right-1.5 -top-1.5 h-3 w-3 border-r-2 border-t-2 border-amber" />
      <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 h-3 w-3 border-b-2 border-l-2 border-amber" />
      <span className="pointer-events-none absolute -bottom-1.5 -right-1.5 h-3 w-3 border-b-2 border-r-2 border-amber" />
    </>
  );
}
