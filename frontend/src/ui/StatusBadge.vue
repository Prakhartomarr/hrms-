<script setup lang="ts">
import { computed } from "vue"
import { statusTone, type Tone } from "@/lib/status"

// `status` is the document status; its tone is looked up unless `tone` is given.
// The label is always text, so colour is never the only signal.
const props = defineProps<{ status: string; tone?: Tone; label?: string }>()
const resolved = computed(() => props.tone ?? statusTone(props.status))
</script>

<template>
	<span class="ui-badge" :class="`ui-badge--${resolved}`">{{ label ?? status }}</span>
</template>

<style scoped>
.ui-badge {
	display: inline-flex;
	align-items: center;
	padding: var(--space-half) var(--space-1);
	border-radius: var(--radius-sm);
	font-size: var(--text-xs);
	line-height: var(--text-xs-lh);
	font-weight: var(--weight-semibold);
	white-space: nowrap;
}
.ui-badge--success {
	background: var(--color-success-tint);
	color: var(--color-success);
}
.ui-badge--warning {
	background: var(--color-warning-tint);
	color: var(--color-warning);
}
.ui-badge--danger {
	background: var(--color-danger-tint);
	color: var(--color-danger);
}
.ui-badge--info {
	background: var(--color-info-tint);
	color: var(--color-info);
}
.ui-badge--neutral {
	background: var(--color-neutral-tint);
	color: var(--color-neutral);
}
</style>
