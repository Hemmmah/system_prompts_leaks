# Prompt Optimizer

A React component (`PromptOptimizer.jsx`) that provides a UI for improving text-classification
prompts. It sends the original prompt, a chosen optimization mode, and optional feedback to a
Claude model and returns an optimized prompt plus a summary of the changes made.

## Features

- **Original Prompt** input for the prompt you want to improve.
- **Model selection** — Claude Sonnet 4 (recommended) or Claude Opus 4.
- **Optimization types:**
  - *Internal Consistency Check* — verify logical flow and eliminate contradictions.
  - *Feedback-Based Revision* — improve the prompt based on specific feedback you provide.
  - *Clarity Enhancement* — improve readability and remove ambiguity.
  - *Effectiveness Optimization* — maximize classification accuracy and performance.
- **Optimized Prompt** output with one-click copy to clipboard.
- **Change Analysis** describing the modifications and the reasoning behind them.

## Dependencies

- [`react`](https://react.dev/)
- [`lucide-react`](https://lucide.dev/) — for the icons.
- [Tailwind CSS](https://tailwindcss.com/) — the component is styled entirely with Tailwind utility classes.
- A `window.claude.complete(prompt)` runtime that returns the model's completion as a string.

## Usage

Import and render the component inside a React app that has the dependencies above configured:

```jsx
import PromptOptimizer from './PromptOptimizer';

function App() {
  return <PromptOptimizer />;
}
```

> **Note:** This is a standalone component. This repository is a documentation collection and
> does not include a build toolchain (bundler, Tailwind config, or the `window.claude.complete`
> runtime), so the component must be dropped into a React project that provides those to run.
