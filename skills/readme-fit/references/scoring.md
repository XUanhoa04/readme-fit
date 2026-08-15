# Scoring interpretation

Treat deterministic scores as explainable summaries of rule results, not objective truth.

- Read each rule’s `status`, `weight`, `earned`, and `explanation`.
- Respect `not_applicable`; never convert it into zero.
- Use the inferred project type when interpreting weights.
- Name the active preset (`minimal`, `balanced`, `oss`, or `portfolio`) when it materially changes prioritization.
- Do not add opaque points for decoration.
- Do not report an AI-generated replacement score unless the user explicitly requests a separate qualitative score and its basis is fully shown.

Category meanings:

- **Correctness**: README claims align with inspectable repository facts.
- **Completeness**: high-value material for the project type is represented.
- **Onboarding**: a visitor can reach first success with little friction.
- **Clarity**: structure and opening explanation communicate the project.
- **First Impression**: heuristic answers to what, why, proof, try, and trust.
- **Visual Proof**: a visitor can see a relevant result; beauty is not the goal.
- **Trust**: licensing and real maintenance signals are visible without badge spam.

Always repeat coverage limitations near conclusions that could otherwise look verified.

When a baseline is attached, distinguish current quality from regression policy. The current score
still describes the whole README; `newFindings` controls whether existing documentation debt should
fail CI. Never describe a network link as healthy unless the scan explicitly used `--check-links`.
