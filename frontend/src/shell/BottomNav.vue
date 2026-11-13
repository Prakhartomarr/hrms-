<script setup lang="ts">
import { useRoute } from "vue-router"
import { Icon } from "@/ui"
import { NAV_ITEMS, isActive } from "./nav"

const route = useRoute()
</script>

<template>
	<nav class="bottom" aria-label="Main">
		<ul class="bottom__list" role="list">
			<li v-for="item in NAV_ITEMS" :key="item.path">
				<RouterLink
					:to="item.path"
					class="bottom__link"
					:aria-current="isActive(item, route.path) ? 'page' : undefined"
				>
					<Icon :name="item.icon" :size="22" />
					<span class="bottom__label">{{ item.label }}</span>
				</RouterLink>
			</li>
		</ul>
	</nav>
</template>

<style scoped>
.bottom {
	position: fixed;
	inset: auto 0 0 0;
	z-index: 20;
	background: var(--color-paper);
	border-top: var(--rule-width) solid var(--color-rule-strong);
	padding-bottom: env(safe-area-inset-bottom);
}
.bottom__list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	height: var(--bottom-nav-height);
}
.bottom__link {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: var(--space-half);
	height: 100%;
	min-width: var(--touch-min);
	color: var(--color-text-muted);
	text-decoration: none;
}
.bottom__label {
	font-size: var(--text-xs);
	line-height: var(--text-xs-lh);
	font-weight: var(--weight-medium);
}
.bottom__link[aria-current="page"] {
	color: var(--color-primary);
}
.bottom__link[aria-current="page"] .bottom__label {
	font-weight: var(--weight-bold);
}
.bottom__link[aria-current="page"]::before {
	content: "";
	position: absolute;
	top: -1px;
	left: 25%;
	right: 25%;
	height: 2px;
	background: var(--color-primary);
}
</style>
