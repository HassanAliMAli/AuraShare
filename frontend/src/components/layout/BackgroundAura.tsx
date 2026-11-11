/** Ambient blurred "Liquid Cloud" background blobs. Purely decorative. */
export function BackgroundAura() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div className="absolute top-[-10%] left-[-10%] w-[60%] md:w-[40%] h-[60%] md:h-[40%] bg-signal/10 blur-[80px] md:blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] md:w-[40%] h-[60%] md:h-[40%] bg-transfer/10 blur-[80px] md:blur-[120px] rounded-full" />
      <div className="absolute top-[20%] right-[10%] w-[50%] md:w-[30%] h-[50%] md:h-[30%] bg-warn/5 blur-[70px] md:blur-[100px] rounded-full" />
    </div>
  );
}
