import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostBubble } from '@/components/HostBubble';
import { MicButton } from '@/components/MicButton';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Drive performance.now() so hold-vs-tap can be tested deterministically. */
function fakeClock(): (ms: number) => void {
  let t = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  return (ms: number) => {
    t += ms;
  };
}

describe('MicButton', () => {
  it('is an accessible toggle button', () => {
    render(
      <MicButton listening={false} level={0} interim="" supported onPress={() => {}} />,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAccessibleName(/voice/i);
    expect(button).not.toBeDisabled();
  });

  it('reflects the listening state', () => {
    render(<MicButton listening level={0.5} interim="" supported onPress={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName(/stop/i);
  });

  it('is disabled when unsupported', () => {
    render(
      <MicButton listening={false} level={0} interim="" supported={false} onPress={() => {}} />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAccessibleName(/not supported/i);
  });

  it('starts listening on pointer down', () => {
    const onPress = vi.fn();
    render(<MicButton listening={false} level={0} interim="" supported onPress={onPress} />);
    fireEvent.pointerDown(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('releases after a hold (hold-to-talk)', () => {
    const advance = fakeClock();
    const onPress = vi.fn();
    const onRelease = vi.fn();
    render(
      <MicButton
        listening={false}
        level={0}
        interim=""
        supported
        onPress={onPress}
        onRelease={onRelease}
      />,
    );
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button);
    advance(600);
    fireEvent.pointerUp(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('keeps listening after a quick tap (tap-to-toggle)', () => {
    const advance = fakeClock();
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const { rerender } = render(
      <MicButton
        listening={false}
        level={0}
        interim=""
        supported
        onPress={onPress}
        onRelease={onRelease}
      />,
    );
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button);
    advance(80);
    fireEvent.pointerUp(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();

    // The parent is now listening; the next tap stops it.
    rerender(
      <MicButton
        listening
        level={0}
        interim=""
        supported
        onPress={onPress}
        onRelease={onRelease}
      />,
    );
    fireEvent.pointerDown(button);
    expect(onRelease).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('uses onPress as the toggle when onRelease is omitted', () => {
    const onPress = vi.fn();
    render(<MicButton listening level={0} interim="" supported onPress={onPress} />);
    fireEvent.pointerDown(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('works from the keyboard', () => {
    const advance = fakeClock();
    const onPress = vi.fn();
    const onRelease = vi.fn();
    render(
      <MicButton
        listening={false}
        level={0}
        interim=""
        supported
        onPress={onPress}
        onRelease={onRelease}
      />,
    );
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    advance(500);
    fireEvent.keyUp(button, { key: ' ' });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('ignores interaction when unsupported', () => {
    const onPress = vi.fn();
    render(
      <MicButton listening={false} level={0} interim="" supported={false} onPress={onPress} />,
    );
    fireEvent.pointerDown(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the interim caption and the error tooltip', () => {
    render(
      <MicButton
        listening
        level={0.3}
        interim="bohemian rap"
        supported
        error="Microphone permission denied"
        onPress={() => {}}
      />,
    );
    expect(screen.getByText('bohemian rap')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Microphone permission denied');
  });
});

describe('HostBubble', () => {
  it('renders the line as text so muted players can read it', () => {
    render(<HostBubble personality="hype" line="Round two! Here we go!" speaking />);
    expect(screen.getByText('Round two! Here we go!')).toBeInTheDocument();
  });

  it('labels the avatar per personality', () => {
    const { rerender } = render(<HostBubble personality="savage" line="Bold." speaking={false} />);
    expect(screen.getByRole('img', { name: 'Savage host' })).toHaveTextContent('😈');
    rerender(<HostBubble personality="radio" line="Stay tuned." speaking={false} />);
    expect(screen.getByRole('img', { name: 'Radio host' })).toHaveTextContent('📻');
    rerender(<HostBubble personality="chill" line="Mm." speaking={false} />);
    expect(screen.getByRole('img', { name: 'Chill host' })).toHaveTextContent('🎧');
    rerender(<HostBubble personality="hype" line="Go!" speaking={false} />);
    expect(screen.getByRole('img', { name: 'Hype host' })).toHaveTextContent('🎤');
  });

  it('renders nothing when there is no line', () => {
    render(<HostBubble personality="hype" line="" speaking={false} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
