export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-page">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-mark border-t-transparent"
        role="status"
        aria-label="Loading sales"
      />
    </div>
  );
}
