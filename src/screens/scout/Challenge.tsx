import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Swords } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeading } from '@/components/SectionHeading';
import { decodeScoutChallenge } from '@/scout/challenge';
import { R } from '@/routes';

/**
 * `/scout/c/:code` — someone sent a Highlight Scout challenge. Decode it, show what they played
 * and what they scored, then hand the identical seeded run to this player.
 */
export default function ScoutChallenge() {
  const { code } = useParams();
  const navigate = useNavigate();
  const payload = useMemo(() => (code ? decodeScoutChallenge(code) : null), [code]);

  if (!payload) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <EmptyState
          as="h1"
          icon={<Swords />}
          title="That challenge link is broken"
          description="The code could not be read. Ask for a fresh link, or start your own scouting session."
          action={<Button to={R.scout.setup}>Start a session</Button>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <SectionHeading as="h1" eyebrow="Highlight Scout" title="You've been challenged" />
      <Card className="mt-6 p-6">
        {typeof payload.score === 'number' && (
          <p className="font-mono text-5xl text-gradient">{payload.score.toLocaleString()}</p>
        )}
        <p className="mt-2 text-muted">
          {payload.by ? `${payload.by} set the mark.` : 'A friend set the mark.'} Same players, same order, same rules.
        </p>
        <Button
          className="mt-6"
          size="lg"
          variant="glow"
          onClick={() => navigate(`${R.scout.setup}?challenge=${encodeURIComponent(code ?? '')}`)}
        >
          Accept the challenge
        </Button>
      </Card>
    </div>
  );
}
