import { h, defineComponent, ref, Fragment, onMounted, onBeforeUnmount, watch } from 'vue'
import { createId, getPreciseEventTarget } from 'seemly'
import { on, off } from 'evtd'
import { focusFirstDescendant, focusLastDescendant } from 'vueuc/es/focus-trap/src/utils'
import { resolveTo } from 'vueuc/es/shared'

let stack = []

// Compatibility copy of vueuc 0.4.65 FocusTrap.
// Chrome warns when a focusable guard also has aria-hidden, so the guards stay
// focusable but no longer mark themselves hidden from assistive tech.
export const FocusTrap = defineComponent({
  name: 'FocusTrap',
  props: {
    disabled: Boolean,
    active: Boolean,
    autoFocus: {
      type: Boolean,
      default: true
    },
    onEsc: Function,
    initialFocusTo: [String, Function],
    finalFocusTo: [String, Function],
    returnFocusOnDeactivated: {
      type: Boolean,
      default: true
    }
  },
  setup(props) {
    const id = createId()
    const focusableStartRef = ref(null)
    const focusableEndRef = ref(null)
    let activated = false
    let ignoreInternalFocusChange = false
    const lastFocusedElement = typeof document === 'undefined' ? null : document.activeElement

    function isCurrentActive() {
      const currentActiveId = stack[stack.length - 1]
      return currentActiveId === id
    }

    function handleDocumentKeydown(e) {
      if (e.code === 'Escape') {
        if (isCurrentActive()) {
          props.onEsc?.(e)
        }
      }
    }

    onMounted(() => {
      watch(() => props.active, (value) => {
        if (value) {
          activate()
          on('keydown', document, handleDocumentKeydown)
        } else {
          off('keydown', document, handleDocumentKeydown)
          if (activated) {
            deactivate()
          }
        }
      }, {
        immediate: true
      })
    })

    onBeforeUnmount(() => {
      off('keydown', document, handleDocumentKeydown)
      if (activated) deactivate()
    })

    function handleDocumentFocus(e) {
      if (ignoreInternalFocusChange) return
      if (isCurrentActive()) {
        const mainEl = getMainEl()
        if (mainEl === null) return
        if (mainEl.contains(getPreciseEventTarget(e))) return
        resetFocusTo('first')
      }
    }

    function getMainEl() {
      const focusableStartEl = focusableStartRef.value
      if (focusableStartEl === null) return null
      let mainEl = focusableStartEl
      while (true) {
        mainEl = mainEl.nextSibling
        if (mainEl === null) break
        if (mainEl instanceof Element && mainEl.tagName === 'DIV') {
          break
        }
      }
      return mainEl
    }

    function activate() {
      if (props.disabled) return
      stack.push(id)
      if (props.autoFocus) {
        const { initialFocusTo } = props
        if (initialFocusTo === undefined) {
          resetFocusTo('first')
        } else {
          resolveTo(initialFocusTo)?.focus({ preventScroll: true })
        }
      }
      activated = true
      document.addEventListener('focus', handleDocumentFocus, true)
    }

    function deactivate() {
      if (props.disabled) return
      document.removeEventListener('focus', handleDocumentFocus, true)
      stack = stack.filter(idInStack => idInStack !== id)
      if (isCurrentActive()) return
      const { finalFocusTo } = props
      if (finalFocusTo !== undefined) {
        resolveTo(finalFocusTo)?.focus({ preventScroll: true })
      } else if (props.returnFocusOnDeactivated) {
        if (lastFocusedElement instanceof HTMLElement) {
          ignoreInternalFocusChange = true
          lastFocusedElement.focus({ preventScroll: true })
          ignoreInternalFocusChange = false
        }
      }
    }

    function resetFocusTo(target) {
      if (!isCurrentActive()) return
      if (props.active) {
        const focusableStartEl = focusableStartRef.value
        const focusableEndEl = focusableEndRef.value
        if (focusableStartEl !== null && focusableEndEl !== null) {
          const mainEl = getMainEl()
          if (mainEl == null || mainEl === focusableEndEl) {
            ignoreInternalFocusChange = true
            focusableStartEl.focus({ preventScroll: true })
            ignoreInternalFocusChange = false
            return
          }
          ignoreInternalFocusChange = true
          const focused = target === 'first'
            ? focusFirstDescendant(mainEl)
            : focusLastDescendant(mainEl)
          ignoreInternalFocusChange = false
          if (!focused) {
            ignoreInternalFocusChange = true
            focusableStartEl.focus({ preventScroll: true })
            ignoreInternalFocusChange = false
          }
        }
      }
    }

    function handleStartFocus(e) {
      if (ignoreInternalFocusChange) return
      const mainEl = getMainEl()
      if (mainEl === null) return
      if (e.relatedTarget !== null && mainEl.contains(e.relatedTarget)) {
        resetFocusTo('last')
      } else {
        resetFocusTo('first')
      }
    }

    function handleEndFocus(e) {
      if (ignoreInternalFocusChange) return
      if (e.relatedTarget !== null && e.relatedTarget === focusableStartRef.value) {
        resetFocusTo('last')
      } else {
        resetFocusTo('first')
      }
    }

    return {
      focusableStartRef,
      focusableEndRef,
      focusableStyle: 'position: absolute; height: 0; width: 0;',
      handleStartFocus,
      handleEndFocus
    }
  },
  render() {
    const { default: defaultSlot } = this.$slots
    if (defaultSlot === undefined) return null
    if (this.disabled) return defaultSlot()
    const { active, focusableStyle } = this
    return h(Fragment, null, [
      h('div', {
        tabindex: active ? '0' : '-1',
        ref: 'focusableStartRef',
        style: focusableStyle,
        onFocus: this.handleStartFocus
      }),
      defaultSlot(),
      h('div', {
        style: focusableStyle,
        ref: 'focusableEndRef',
        tabindex: active ? '0' : '-1',
        onFocus: this.handleEndFocus
      })
    ])
  }
})
