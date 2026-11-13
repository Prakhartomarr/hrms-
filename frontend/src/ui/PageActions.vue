<script setup lang="ts">
/**
 * The action row of a view. It takes at most ONE primary action by construction
 * (a single `primary` prop), plus any number of secondary ones. The primary sits first
 * on phones (full width) and last on desktop, where people expect it.
 */
import type { RouteLocationRaw } from "vue-router"
import UiButton from "./UiButton.vue"

export type Action = {
	label: string
	onClick?: () => void
	to?: RouteLocationRaw
	icon?: string
	disabled?: boolean
	loading?: boolean
	type?: "button" | "submit"
}

defineProps<{ primary?: Action; secondary?: Action[]; sticky?: boolean }>()
</script>

<template>
	<div class="page-actions" :class="{ 'page-actions--sticky': sticky }">
		<UiButton
			v-for="action in secondary ?? []"
			:key="action.label"
			variant="secondary"
			:to="action.to"
			:icon="action.icon"
			:disabled="action.disabled"
			:loading="action.loading"
			:type="action.type"
			@click="action.onClick?.()"
		>
			{{ action.label }}
		</UiButton>
		<UiButton
			v-if="primary"
			class="page-actions__primary"
			variant="primary"
			:to="primary.to"
			:icon="primary.icon"
			:disabled="primary.disabled"
			:loading="primary.loading"
			:type="primary.type"
			@click="primary.onClick?.()"
		>
			{{ primary.label }}
		</UiButton>
	</div>
</template>

<style scoped>
.page-actions {
	display: flex;
	flex-direction: column-reverse;
	gap: var(--space-1);
	margin-top: var(--space-3);
}
.page-actions :deep(.ui-button) {
	width: 100%;
}
.page-actions--sticky {
	position: sticky;
	bottom: 0;
	padding: var(--space-2) 0;
	background: var(--color-bg);
}
@media (min-width: 600px) {
	.page-actions {
		flex-direction: row;
		justify-content: flex-end;
	}
	.page-actions :deep(.ui-button) {
		width: auto;
	}
}
</style>
