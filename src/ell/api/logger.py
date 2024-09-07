import logging
from typing import Literal, Union
from colorama import Fore, Style, init


LogLevel = Union[Literal['CRITICAL'], Literal['FATAL'], Literal['ERROR'], Literal['WARN'],
                 Literal['WARNING'], Literal['INFO'], Literal['DEBUG'], Literal['NOTSET']]


initialized = False
def setup_logging(level: LogLevel = "INFO"):
    global initialized
    if initialized:
        return
    # Initialize colorama for cross-platform colored output
    init(autoreset=True)

    # Create a custom formatter
    class ColoredFormatter(logging.Formatter):
        FORMATS = {
            logging.DEBUG: Fore.CYAN + "[%(asctime)s] %(levelname)-8s %(name)s: %(message)s" + Style.RESET_ALL,
            logging.INFO: Fore.GREEN + "[%(asctime)s] %(levelname)-8s %(name)s: %(message)s" + Style.RESET_ALL,
            logging.WARNING: Fore.YELLOW + "[%(asctime)s] %(levelname)-8s %(name)s: %(message)s" + Style.RESET_ALL,
            logging.ERROR: Fore.RED + "[%(asctime)s] %(levelname)-8s %(name)s: %(message)s" + Style.RESET_ALL,
            logging.CRITICAL: Fore.RED + Style.BRIGHT + "[%(asctime)s] %(levelname)-8s %(name)s: %(message)s" + Style.RESET_ALL
        }

        def format(self, record: logging.LogRecord) -> str:
            log_fmt = self.FORMATS.get(record.levelno)
            formatter = logging.Formatter(log_fmt, datefmt="%Y-%m-%d %H:%M:%S")
            return formatter.format(record)

    # Create and configure the logger
    logger = logging.getLogger("ell")
    logger.setLevel(logging.getLevelName(level.upper()))

    # Create console handler and set formatter
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(ColoredFormatter())

    # Add the handler to the logger
    logger.addHandler(console_handler)

    initialized = True

    return logger