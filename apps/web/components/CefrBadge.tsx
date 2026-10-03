import type { Level } from '@ai-learning/shared';
import { Badge } from '@/components/ui/Badge';

export const CefrBadge = ({ level }: { level: Level | string }) => <Badge variant="cefr" level={level}>{level}</Badge>;