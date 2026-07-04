import { Avatar, AvatarFallback } from '../../../../components/ui/avatar';
import { Badge } from '../../../../components/ui/badge';
import { initialsOf, shortLanguageName } from '../format';
import type { ConsoleViewModel } from '../console.hook';

/**
 * Slim consultation strip on top of the console: clinic · OPD, the AHMIS
 * sync badge, the translation-direction mono pill, and the doctor identity.
 */
export function ContextStrip({
  consultation,
  doctorName,
}: Pick<ConsoleViewModel, 'consultation' | 'doctorName'>) {
  const synced = consultation.ahmisStatus === 'synced';
  return (
    <div className="flex h-12 flex-none items-center gap-3 border-b border-edge bg-panel px-4">
      <span className="text-[13px] text-ink-dim">
        Shri Dhanvantari AYUSH Wellness Centre · OPD 2
      </span>
      <div className="flex-1" />
      {synced ? (
        <Badge variant="success" className="gap-1.5 text-xs">
          <span
            aria-hidden
            className="size-[7px] animate-vedita-blink rounded-full bg-ok [animation-duration:2s]"
          />
          AHMIS synced
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-xs text-ink-dim">
          AHMIS pending
        </Badge>
      )}
      <Badge className="font-mono text-xs">
        {shortLanguageName(consultation.doctorLanguage)} ⇄{' '}
        {shortLanguageName(consultation.patientLanguage)}
      </Badge>
      <div className="flex items-center gap-2.5">
        <Avatar className="size-8">
          <AvatarFallback className="bg-accent-soft text-[13px] font-semibold text-accent">
            {initialsOf(doctorName)}
          </AvatarFallback>
        </Avatar>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">{doctorName}</div>
          <div className="text-[11px] text-ink-dim">BAMS · Kayachikitsa</div>
        </div>
      </div>
    </div>
  );
}
