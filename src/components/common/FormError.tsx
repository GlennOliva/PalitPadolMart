interface FormErrorProps {
  message: string
}

export default function FormError({ message }: FormErrorProps) {
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  )
}
