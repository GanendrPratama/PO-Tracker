import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";


interface CustomDatePickerProps {
    selected: Date | null;
    onChange: (date: Date | null) => void;
    label?: string;
    placeholderText?: string;
    required?: boolean;
}

export function CustomDatePicker({ selected, onChange, label, placeholderText, required }: CustomDatePickerProps) {
    return (
        <div className="form-group custom-datepicker-container">
            {label && <label className="form-label">{label} {required && '*'}</label>}
            <DatePicker
                selected={selected}
                onChange={onChange}
                className="form-input"
                placeholderText={placeholderText}
                dateFormat="MMM d, yyyy"
                wrapperClassName="date-picker-wrapper"
                showPopperArrow={false}
            />
        </div>
    );
}
