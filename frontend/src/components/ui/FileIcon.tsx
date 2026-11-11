import { Image, Film, Music, FileText, FileArchive, File, FileType } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getFileIconKey, type FileIconKey } from '../../lib/format';

const ICON_MAP: Record<FileIconKey, LucideIcon> = {
  image: Image,
  video: Film,
  audio: Music,
  text: FileText,
  archive: FileArchive,
  pdf: FileType,
  file: File,
};

interface FileIconProps {
  name: string;
  type: string;
  className?: string;
}

/** Renders the correct lucide icon for a file based on its name/MIME type. */
export function FileIcon({ name, type, className }: FileIconProps) {
  const key = getFileIconKey(name, type);
  const Icon = ICON_MAP[key] ?? File;
  return <Icon className={className} aria-hidden="true" />;
}
