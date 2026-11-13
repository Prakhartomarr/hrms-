<script setup lang="ts">
/**
 * The end of a key flow (CLAUDE.md): what happened, the details that matter, and
 * exactly one next step, which is the view's primary action.
 */
import type { Action } from "./PageActions.vue"
import TickMark from "./TickMark.vue"
import UiButton from "./UiButton.vue"

defineProps<{ title: string; message?: string; next: Action; secondary?: Action }>()
</script>

<template>
	<div class="ui-success" role="status" aria-live="polite">
		<span class="ui-success__icon"><TickMark done :size="40" label="Done" /></span>
		<h2 class="ui-success__title">{{ title }}</h2>
		<p v-if="message" class="ui-success__message">{{ message }}</p>
		<div v-if="$slots.default" class="ui-success__details"><slot /></div>
		<div class="ui-success__actions">
			<UiButton variant="primary" :to="next.to" :icon="next.icon" block @click="next.onClick?.()">
				{{ next.label }}
			</UiButton>
			<UiButton
				v-if="secondary"
				variant="ghost"
				:to="secondary.to"
				block
				@click="secondary.onClick?.()"
			>
				{{ secondary.label }}
			</UiButton>
		</div>
	</div>
</template>

<style scoped>
.ui-success {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--space-1);
	padding: var(--space-3) 0;
}
.ui-success__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	margin-bottom: var(--space-1);
}
.ui-success__title {
	font-size: var(--text-2xl);
	line-height: var(--text-2xl-lh);
	font-weight: var(--weight-bold);
}
.ui-success__message {
	color: var(--color-text-muted);
	max-width: 52ch;
}
.ui-success__details {
	width: 100%;
	margin-top: var(--space-1);
}
.ui-success__actions {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	width: 100%;
	max-width: 360px;
	margin-top: var(--space-3);
}
</style>
