<script setup lang="ts">
/**
 * One entry on a ruled list: tick (done) or empty box (pending), the label, an optional
 * figure in mono tabular numerals, and an optional footnote in the `note` slot.
 */
import TickMark from "./TickMark.vue"

defineProps<{ label?: string; detail?: string; figure?: string; unit?: string; done?: boolean }>()
</script>

<template>
	<li class="ui-line" :class="{ 'ui-line--pending': !done }">
		<TickMark class="ui-line__tick" :done="done" :label="done ? 'Checked' : 'To do'" />
		<div class="ui-line__label">
			<span class="ui-line__text"><slot>{{ label }}</slot></span>
			<span v-if="detail || $slots.detail" class="ui-line__detail">
				<slot name="detail">{{ detail }}</slot>
			</span>
		</div>
		<span v-if="figure" class="ui-line__figure">
			<span class="num">{{ figure }}</span>
			<span v-if="unit" class="ui-line__unit">{{ unit }}</span>
		</span>
		<span v-else class="ui-line__figure" aria-hidden="true" />
		<slot name="note"><span class="ui-line__nonote" aria-hidden="true" /></slot>
	</li>
</template>

<style scoped>
.ui-line {
	display: grid;
	grid-template-columns: var(--space-3) 1fr auto var(--touch-min);
	column-gap: var(--space-1);
	align-items: start;
	min-height: var(--space-6);
	border-bottom: var(--rule-width) solid var(--color-rule);
}
.ui-line__tick {
	margin-top: var(--space-1);
}
.ui-line__label {
	display: flex;
	flex-direction: column;
	padding: var(--space-1) 0;
	min-width: 0;
}
.ui-line__detail {
	color: var(--color-text-muted);
	font-size: var(--text-sm);
	line-height: var(--text-sm-lh);
}
.ui-line__figure {
	padding: var(--space-1) 0;
	text-align: right;
	white-space: nowrap;
	font-size: var(--text-lg);
	line-height: var(--text-md-lh);
	font-weight: var(--weight-medium);
}
.ui-line__unit {
	margin-left: var(--space-half);
	font-size: var(--text-sm);
	color: var(--color-text-muted);
}
</style>
