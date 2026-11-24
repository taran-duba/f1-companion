/** Key for the map's dot styles, so fill and ring aren't the only cue left unexplained. */
export function MapLegend() {
  return (
    <ul aria-label="Map key" className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-micro text-muted">
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="block size-3 rounded-full border-2 border-bg bg-muted" />
        Running (team colour)
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="block size-3 rounded-full border-[2.5px] border-muted bg-bg opacity-60" />
        In pit, stopped or retired
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="block size-3 rounded-full border-2 border-bg bg-muted"
          style={{ boxShadow: "0 0 0 2px var(--color-bg), 0 0 0 3.5px var(--color-select)" }}
        />
        Selected
      </li>
    </ul>
  );
}
