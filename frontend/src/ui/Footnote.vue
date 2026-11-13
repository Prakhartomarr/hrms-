<script setup lang="ts">
/**
 * A numbered footnote that expands in place to show how a figure was worked out.
 * The root uses display: contents, so inside a RuledLine the marker sits at the end
 * of the line and the working opens as a full-width row under it.
 */
import { ref } from "vue"

const props = withDefaults(defineProps<{ n: number | string; label?: string }>(), {
	label: "How this was worked out",
})
const open = ref(false)
const id = `fn-${props.n}-${Math.random().toString(36).slice(2, 7)}`
</script>

<template>
	<div class="ui-footnote">
		<button
			type="button"
			class="ui-footnote__marker"
			:aria-expanded="open ? 'true' : 'false'"
			:aria-controls="id"
			:aria-label="`Note ${n}: ${label}`"
			@click="open = !open"
		>
			<span class="num" aria-hidden="true">{{ n }}</span>
		</button>
		<div v-show="open" :id="id" class="ui-footnote__body" role="note">
			<span class="ui-footnote__ref num" aria-hidden="true">{{ n }}</span>
			<div class="ui-footnote__text"><slot /></div>
		</div>
	</div>
</template>

<style scoped>
.ui-footnote {
	display: contents;
}
.ui-footnote__marker {
	display: inline-flex;
	align-items: flex-start;
	justify-content: center;
	min-width: var(--touch-min);
	min-height: var(--touch-min);
	padding: var(--space-1) 0 0;
	border: none;
	background: transparent;
	color: var(--color-link);
	font-size: var(--text-sm);
	line-height: var(--text-sm-lh);
	cursor: pointer;
	text-decoration: underline;
	text-underline-offset: 0.2em;
}
.ui-footnote__marker[aria-expanded="true"] {
	color: var(--color-text);
	text-decoration-style: solid;
}
.ui-footnote__body {
	grid-column: 1 / -1;
	display: flex;
	gap: var(--space-1);
	margin: 0 0 var(--space-2) var(--space-4);
	padding-top: var(--space-1);
	border-top: var(--rule-width) dashed var(--color-rule);
	color: var(--color-text-muted);
	font-size: var(--text-sm);
	line-height: var(--text-sm-lh);
}
.ui-footnote__ref {
	color: var(--color-text-subtle);
	font-size: var(--text-xs);
}
</style>
