from pathlib import Path

path = Path("main.py")
source = path.read_text(encoding="utf-8")

start_marker = "def joint_allocate_time_aware_plans("
end_marker = "def get_time_aware_allocation_alternatives("

start = source.find(start_marker)
end = source.find(end_marker, start)

if start < 0 or end < 0:
    raise SystemExit("Could not locate the scheduler and helper functions.")

function = source[start:end]

# Add optional parameters while preserving existing callers.
old_signature = '''    max_plans_per_shipment=MAX_PLANS_PER_SHIPMENT,
    scoring_policy="QIGA",
):'''

new_signature = '''    max_plans_per_shipment=MAX_PLANS_PER_SHIPMENT,
    scoring_policy="QIGA",
    return_alternatives=False,
    max_alternatives=2,
):'''

if old_signature not in function:
    raise SystemExit("Signature did not match; no changes written.")

function = function.replace(old_signature, new_signature, 1)

# Validate the alternatives limit.
old_validation = '''    if not shipment_items:
        return {}
'''

new_validation = '''    if max_alternatives < 1:
        raise ValueError("max_alternatives must be positive.")

    if not shipment_items:
        return [] if return_alternatives else {}
'''

if old_validation not in function:
    raise SystemExit("Empty-input block did not match; no changes written.")

function = function.replace(old_validation, new_validation, 1)

# Preserve distinct allocations during beam deduplication when requested.
old_dedupe = '''        # Deduplicate scheduling states while retaining availability
        # and location information needed for future shipments.
        best_by_signature = {}

        for state in expanded_states:
            signature = state_signature(state)
            current = best_by_signature.get(signature)

            if (
                current is None
                or state_rank(state) < state_rank(current)
            ):
                best_by_signature[signature] = state

        states = sorted(
            best_by_signature.values(),
            key=state_rank,
        )[:beam_width]

    # Preserve the original dictionary return contract.
    best_state = min(states, key=state_rank)
    return best_state["selected"]
'''

new_dedupe = '''        # Deduplicate scheduling states. Preserve distinct allocations
        # when the caller requests alternatives.
        best_by_signature = {}

        for state in expanded_states:
            signature = state_signature(state)

            if return_alternatives:
                allocation_signature = tuple(
                    sorted(
                        (
                            index,
                            tuple(sorted(
                                str(v)
                                for v in plan.get("vessel_ids", [])
                            )),
                            plan.get("speed_strategy", "UNKNOWN"),
                        )
                        for index, plan in state["selected"].items()
                    )
                )
                signature = (signature, allocation_signature)

            current = best_by_signature.get(signature)

            if (
                current is None
                or state_rank(state) < state_rank(current)
            ):
                best_by_signature[signature] = state

        states = sorted(
            best_by_signature.values(),
            key=state_rank,
        )[:beam_width]

    if return_alternatives:
        alternatives = []
        seen_allocations = set()

        for state in sorted(states, key=state_rank):
            selected = state["selected"]

            signature = tuple(
                sorted(
                    (
                        index,
                        tuple(sorted(
                            str(v)
                            for v in plan.get("vessel_ids", [])
                        )),
                        plan.get("speed_strategy", "UNKNOWN"),
                    )
                    for index, plan in selected.items()
                )
            )

            if signature in seen_allocations:
                continue

            seen_allocations.add(signature)
            alternatives.append(selected)

            if len(alternatives) >= max_alternatives:
                break

        return alternatives

    # Preserve the original dictionary return contract.
    best_state = min(states, key=state_rank)
    return best_state["selected"]
'''

if old_dedupe not in function:
    raise SystemExit("Deduplication block did not match; no changes written.")

function = function.replace(old_dedupe, new_dedupe, 1)

# Replace the helper immediately following the scheduler.
helper_end = source.find("\n\n", end)
if helper_end < 0:
    raise SystemExit("Could not locate the end of the helper.")

# Find the next section marker so the helper replacement is bounded.
section = source.find("# BASIC API", end)
if section < 0:
    raise SystemExit("Could not locate the next section marker.")

new_helper = '''def get_time_aware_allocation_alternatives(
    *args,
    max_alternatives=2,
    **kwargs,
):
    """Return up to max_alternatives distinct feasible allocations."""
    if max_alternatives < 1:
        raise ValueError("max_alternatives must be positive.")

    return joint_allocate_time_aware_plans(
        *args,
        return_alternatives=True,
        max_alternatives=max_alternatives,
        **kwargs,
    )


'''

updated = source[:start] + function + new_helper + source[section:]

backup = path.with_suffix(".py.before_alternatives.bak")
backup.write_text(source, encoding="utf-8")
path.write_text(updated, encoding="utf-8")

print(f"Updated scheduler. Original backed up to {backup}")
