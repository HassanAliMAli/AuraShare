import { TransmissionCodePanel } from '../ui/TransmissionCodePanel';
import { RoomQr } from '../ui/RoomQr';
import { motion } from 'motion/react';
import { Check, Clock } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { FileIcon } from '../ui/FileIcon';
import { viewVariants, receiveFormVariants } from '../../lib/motion';
import { isRoomCode, normalizeRoomCode, ROOM_CODE_HINT } from '../../lib/roomCode';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

/** Matches CODE_VALIDITY_MS in backend/modules/room-protocol.ts. */
const UNPAIRED_CODE_TTL_MS = 10 * 60_000;

/** Receiver's code-entry form (idle + isReceiving). */
export function ReceiveCodeForm() {
  const { state, actions } = useAppStore();

  const code = normalizeRoomCode(state.joinCode);
  const codeIsValid = isRoomCode(code);
  // Only call out the format once the field is full — nagging mid-typing is noise.
  const hint =
    state.joinCodeError ?? (code.length === 6 && !codeIsValid ? ROOM_CODE_HINT : null);

  return (
    <motion.div
      variants={receiveFormVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 w-full max-w-md"
    >
      <Panel className="p-6 md:p-8">
        <h2 className="text-lg font-medium text-text">Receive a transfer</h2>
        <p className="mt-2 text-sm text-text-2">
          Enter the six-character code shown on the sending device.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            actions.join(state.joinCode);
          }}
          className="mt-6 flex flex-col gap-4"
        >
          <label htmlFor="join-code" className="sr-only">
            Six-character code
          </label>
          <input
            id="join-code"
            type="text"
            maxLength={6}
            value={state.joinCode}
            onChange={(e) => actions.setJoinCode(normalizeRoomCode(e.target.value))}
            placeholder="A1B2C3"
            aria-invalid={code.length === 6 && !codeIsValid}
            aria-describedby={hint ? 'join-code-hint' : undefined}
            className="w-full rounded-md border border-border-strong bg-canvas px-4 py-4 text-center font-mono text-2xl font-medium uppercase tracking-[0.2em] text-text placeholder:text-text-3 transition-colors focus:border-accent focus:outline-none"
          />
          {hint && (
            <p
              id="join-code-hint"
              role="alert"
              className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-center text-xs text-error"
            >
              {hint}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={!codeIsValid}
            className="w-full"
          >
            Establish connection
          </Button>
        </form>

        <Button variant="muted" onClick={actions.reset} className="mt-6 w-full">
          Cancel
        </Button>
      </Panel>
    </motion.div>
  );
}

/** Sender waiting screen: shows the code + sent-file acknowledgement list. */
export function SharingView() {
  const { state, actions } = useAppStore();
  const waitingForPeer = !state.receiverReady && !state.textAcknowledged;

  return (
    <motion.div
      variants={viewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 flex w-full flex-col items-center px-4"
    >
      <div className="w-full max-w-md">
        <TransmissionCodePanel
          code={state.roomId}
          alignment="center"
          expiresAt={
            state.roomCreatedAt !== null && waitingForPeer
              ? state.roomCreatedAt + UNPAIRED_CODE_TTL_MS
              : null
          }
        >
          {state.roomId && waitingForPeer && <RoomQr code={state.roomId} />}
        </TransmissionCodePanel>

        <p className="mt-5 text-center font-mono text-xs uppercase tracking-[0.14em] text-text-3">
          {state.textAcknowledged ? 'Text delivered' : state.receiverReady ? 'Receiver connected' : 'Waiting for the other device'}
        </p>

        {state.transferError && (
          <div role="alert" className="mt-4 border border-error/40 p-3 text-sm text-error">
            <p>{state.transferError}</p>
            {state.sentFiles.length === 0 ? (
              <Button className="mt-3" onClick={actions.retryText}>Retry text</Button>
            ) : <p className="mt-2">The receiving device can retry or skip this file.</p>}
          </div>
        )}
        {state.sentFiles.length > 0 && (
          <div className="mt-8">
            <div className="flex items-baseline justify-between border-b border-border pb-2">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-3">
                Files sent
              </span>
              <span className="font-mono text-xs text-text-3">{state.sentFiles.length}</span>
            </div>
            <ul>
              {state.sentFiles.map((file, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-border py-3"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <FileIcon
                      name={file.name}
                      type={file.type}
                      className="h-4 w-4 shrink-0 text-text-3"
                    />
                    <span className="truncate text-sm text-text">{file.name}</span>
                  </span>
                  {state.acknowledgedFiles.has(i) ? (
                    <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <Clock className="h-4 w-4 shrink-0 text-text-3" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button variant="muted" onClick={actions.reset} className="mt-8 w-full">
          End session
        </Button>
      </div>
    </motion.div>
  );
}
