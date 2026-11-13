<script setup lang="ts">
import { useRoute } from "vue-router"
import { Icon } from "@/ui"
import BrandMark from "./BrandMark.vue"
import { NAV_ITEMS, isActive } from "./nav"

const route = useRoute()
</script>

<template>
	<nav class="side" aria-label="Main">
		<RouterLink to="/" class="side__brand"><BrandMark /></RouterLink>
		<ul class="side__list" role="list">
			<li v-for="item in NAV_ITEMS" :key="item.path">
				<RouterLink
					:to="item.path"
					class="side__link"
					:aria-current="isActive(item, route.path) ? 'page' : undefined"
				>
					<Icon :name="item.icon" />
					<span>{{ item.label }}</span>
				</RouterLink>
			</li>
		</ul>
	</nav>
</template>

<style scoped>
.side {
	position: sticky;
	top: 0;
	height: 100dvh;
	flex-direction: column;
	gap: var(--space-3);
	padding: var(--space-2);
	background: var(--color-paper);
	border-right: var(--rule-width) solid var(--color-rule);
}
.side__brand {
	display: flex;
	align-items: center;
	min-height: var(--touch-min);
	padding: 0 var(--space-1);
	text-decoration: none;
}
.side__list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: var(--space-half);
}
.side__link {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	min-height: var(--touch-min);
	padding: 0 var(--space-1);
	border-radius: var(--radius-sm);
	color: var(--color-text-muted);
	font-weight: var(--weight-medium);
	text-decoration: none;
}
.side__link:hover {
	background: var(--color-surface-muted);
	color: var(--color-text);
}
.side__link[aria-current="page"] {
	color: var(--color-text);
	font-weight: var(--weight-semibold);
	text-decoration: underline;
	text-decoration-color: var(--color-rule-strong);
	text-decoration-thickness: 2px;
	text-underline-offset: 0.35em;
}
.side__link[aria-current="page"] :deep(.ui-icon) {
	color: var(--color-primary);
}
</style>
