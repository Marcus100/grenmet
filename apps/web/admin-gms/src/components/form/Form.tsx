import type { FC, FormEvent, ReactNode } from "react";

interface FormProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  className?: string;
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
