import { useMemo } from 'react';
import { renderSVG } from 'uqr';

/**
 * QR for the waiting room's join link.
 *
 * The code is small enough to read aloud, but a phone camera is faster and
 * cannot transpose a character. The SVG is generated locally and embedded as
 * a data URI: the room code never goes to an image service, and the CSP
 * already allows `data:` images.
 */
export function RoomQr({ code }: { code: string }) {
  const src = useMemo(() => {
    const joinUrl = `${window.location.origin}/app?code=${encodeURIComponent(code)}`;
    const svg = renderSVG(joinUrl, {
      // Medium recovery tolerates a fingerprint or a smudge on a screen.
      ecc: 'M',
      border: 4,
      pixelSize: 5,
      blackColor: '#0e0e0c',
      whiteColor: '#f0eee7',
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [code]);

  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      <img
        src={src}
        alt={`QR code to join room ${code}`}
        width={168}
        height={168}
        className="h-[168px] w-[168px] border border-border"
      />
      <p className="text-center text-xs leading-relaxed text-text-3">
        Scan with your phone camera to open the receive screen with this code filled in.
      </p>
    </div>
  );
}
