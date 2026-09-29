<?php

declare(strict_types=1);

foreach (['storage/framework/views', 'storage/framework/cache/data', 'storage/framework/sessions', 'bootstrap/cache'] as $directory) {
    if (! is_dir($directory)) {
        mkdir($directory, 0775, true);
    }
}
