# Agent skill evaluation scenarios

## Broken CLI README

Input: a CLI repository with a stale npm command, missing expected output, and no demo near the hero.

Expected behavior: prioritize the broken command as P0 before visual-proof advice; cite README and package metadata; state that commands were not executed.

## Tiny library without branding

Input: a small library with correct installation and a useful code example, but no logo or video.

Expected behavior: do not call missing branding or video a high-priority problem; mark irrelevant visual rules `N/A`.

## Profile skill wall

Input: a GitHub Profile README dominated by technology icons with several strong, under-explained repositories.

Expected behavior: recommend proof of work before decoration and state that public GitHub evidence does not measure actual human ability.
