/** Fixed, cheap animated background: three drifting gradient blobs + subtle noise. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="noise absolute inset-0 opacity-70" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg to-transparent" />
    </div>
  );
}
