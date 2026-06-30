import type { FC, FormEvent, ReactNode } from "react";

interface FormProps {
  children: ReactNode;
  className?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const Form: FC<FormProps> = ({ onSubmit, children, className }) => {
  return (
    <form
      className={` ${className}`}
      onSubmit={(event) => {
        event.preventDefault(); // Prevent default form submission
        onSubmit(event);
      }} // Default spacing between form fields
    >
      {children}
    </form>
  );
};

export default Form;
