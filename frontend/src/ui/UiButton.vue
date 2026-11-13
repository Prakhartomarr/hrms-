<script setup lang="ts">
import { inject, onBeforeUnmount, watch, useSlots, computed } from "vue"
import type { RouteLocationRaw } from "vue-router"
import { registerPrimary } from "@/lib/primaryGuard"
import Icon from "./Icon.vue"
import { PRIMARY_SCOPE } from "./keys"

const props = withDefaults(
	defineProps<{
		variant?: "primary" | "secondary" | "ghost" | "danger"
		to?: RouteLocationRaw
		type?: "button" | "submit"
		icon?: string
		loading?: boolean
		disabled?: boolean
		block?: boolean
	}>(),
	{ variant: "secondary", type: "button" }
)

const slots = useSlots()
const scope = inject(PRIMARY_SCOPE, "page")
const label = computed(() => {
	const nodes = slots.default?.() ?? []
	return nodes.map((n) => (typeof n.children === "string" ? n.children : "")).join("").trim()
})

let release: (() => void) | null = null
watch(
	() => props.variant,
	(variant) => {
		release?.()
		release = variant === "primary" ? registerPrimary(scope, label.value || "button") : null
	},
	{ immediate: true }
)
onBeforeUnmount(() => release?.())
</script>

<template>
	<component
		:is="to ? 'RouterLink' : 'button'"
		:to="to"
		:type="to ? undefined : type"
		:disabled="to ? undefined : disabled || loading"
		:aria-disabled="disabled || loading ? 'true' : undefined"
		:aria-busy="loading ? 'true' : undefined"
		class="ui-button"
		:class="[`ui-button--${variant}`, { 'ui-button--block': block }]"
	>
		<span v-if="loading" class="ui-button__spinner" aria-hidden="true" />
		<Icon v-else-if="icon" :name="icon" :size="18" />
		<span><slot /></span>
	</component>
</template>

<style scoped>
.ui-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--space-1);
	min-height: var(--control-height);
	min-width: var(--touch-min);
	padding: 0 var(--space-2);
	border: 1px solid transparent;
	border-radius: var(--radius-md);
	font: inherit;
	font-weight: var(--weight-semibold);
	font-size: var(--text-md);
	line-height: var(--text-md-lh);
	text-decoration: none;
	cursor: pointer;
	transition:
		background-color var(--duration-fast) var(--ease-standard),
		border-color var(--duration-fast) var(--ease-standard);
}
.ui-button--block {
	width: 100%;
}
.ui-button--primary {
	background: var(--color-primary);
	color: var(--color-on-primary);
}
.ui-button--primary:hover:not(:disabled) {
	background: var(--color-primary-hover);
}
.ui-button--secondary {
	background: var(--color-surface);
	color: var(--color-text);
	border-color: var(--color-border-strong);
}
.ui-button--secondary:hover:not(:disabled) {
	background: var(--color-surface-muted);
}
.ui-button--ghost {
	background: transparent;
	color: var(--color-link);
}
.ui-button--ghost:hover:not(:disabled) {
	background: var(--color-surface-muted);
}
.ui-button--danger {
	background: var(--color-surface);
	color: var(--color-danger);
	border-color: var(--color-danger);
}
.ui-button:disabled {
	cursor: not-allowed;
	background: var(--color-neutral-tint);
	color: var(--color-text-muted);
	border-color: var(--color-border);
}
.ui-button__spinner {
	width: 16px;
	height: 16px;
	border-radius: var(--radius-full);
	border: 2px solid currentColor;
	border-right-color: transparent;
	animation: ui-spin 0.8s linear infinite;
}
@keyframes ui-spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
