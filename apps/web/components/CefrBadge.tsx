import type { Level } from '@quantara/shared';
import { Badge } from '@/components/ui/Badge';

export const CefrBadge = ({ level }: { level: Level | string }) => <Badge variant="cefr" level={level}>{level}</Badge>;