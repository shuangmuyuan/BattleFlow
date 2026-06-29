"use client"

import * as React from "react"

import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface PromptInputContextValue {
  value: string
  onValueChange: (value: string) => void
  isLoading: boolean
}

const PromptInputContext = React.createContext<PromptInputContextValue | null>(null)

function usePromptInputContext() {
  const context = React.useContext(PromptInputContext)
  if (!context) {
    throw new Error("PromptInput components must be used inside PromptInput")
  }
  return context
}

function PromptInput({
  value,
  onValueChange,
  isLoading = false,
  onSubmit,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "onSubmit"> & {
  value: string
  onValueChange: (value: string) => void
  isLoading?: boolean
  onSubmit?: () => void
}) {
  const contextValue = React.useMemo<PromptInputContextValue>(
    () => ({ value, onValueChange, isLoading }),
    [isLoading, onValueChange, value],
  )

  return (
    <PromptInputContext.Provider value={contextValue}>
      <form
        data-slot="prompt-input"
        className={cn(
          "flex min-w-0 flex-col rounded-lg border border-border/60 bg-background/80 p-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15",
          className,
        )}
        onSubmit={(event) => {
          event.preventDefault()
          if (!isLoading) {
            onSubmit?.()
          }
        }}
        {...props}
      >
        {children}
      </form>
    </PromptInputContext.Provider>
  )
}

function PromptInputTextarea({
  className,
  disabled,
  onChange,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  const { value, onValueChange, isLoading } = usePromptInputContext()

  return (
    <Textarea
      data-slot="prompt-input-textarea"
      value={value}
      disabled={disabled ?? isLoading}
      onChange={(event) => {
        onValueChange(event.target.value)
        onChange?.(event)
      }}
      className={cn(
        "max-h-40 min-h-20 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0 dark:bg-transparent",
        className,
      )}
      {...props}
    />
  )
}

function PromptInputActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-actions"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

function PromptInputAction({
  tooltip,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  tooltip?: React.ReactNode
}) {
  const action = (
    <div
      data-slot="prompt-input-action"
      className={cn("flex items-center", className)}
      {...props}
    >
      {children}
    </div>
  )

  if (!tooltip) return action

  return (
    <Tooltip>
      <TooltipTrigger asChild>{action}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
}
